"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Image as KImage, Line, Rect, Text as KText, Group, Transformer } from "react-konva";
import Konva from "konva";
import useImage from "use-image";

// базовые размеры
const BASE_W = 2400;
const BASE_H = 3200;

const FRONT_SRC = "/mockups/MOCAP_FRONT.png";
const BACK_SRC  = "/mockups/MOCAP_BACK.png";

type Tool = "move" | "brush" | "erase" | "text" | "shape";
type Side = "front" | "back";
type ShapeKind = "circle" | "square" | "triangle" | "line";
type Blend = "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten";

const uid = () => Math.random().toString(36).slice(2);

type BaseMeta = {
  blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean;
};

type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group;
type LayerType = "image" | "shape" | "text" | "stroke";

type AnyLayer = {
  id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType;
};

export default function EditorCanvas() {
  // mount-флаг, чтобы не трогать window до гидрации
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // простые стейты (вместо внешнего стора — чтобы минимизировать риски)
  const [side, setSide] = useState<Side>("front");
  const [tool, setTool] = useState<Tool>("move");
  const [brushColor, setBrushColor] = useState("#ff2a7a");
  const [brushSize, setBrushSize] = useState(8);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("circle");

  const [layers, setLayers] = useState<AnyLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const stageRef = useRef<Konva.Stage>(null);
  const tRef = useRef<Konva.Transformer>(null);

  const [frontMock] = useImage(FRONT_SRC, "anonymous");
  const [backMock]  = useImage(BACK_SRC,  "anonymous");

  // безопасный расчёт масштаба — только после mount
  const { viewW, viewH, scale } = useMemo(() => {
    if (!mounted) return { viewW: BASE_W, viewH: BASE_H, scale: 1 };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxW = vw - 40;           // поля
    const maxH = vh - 120;          // учёт шапки
    const s = Math.min(maxW / BASE_W, maxH / BASE_H);
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s };
  }, [mounted, layers.length, side]);

  const visLayers = useMemo(
    () => layers.filter(l => l.side === side && l.meta.visible),
    [layers, side]
  );

  const findNode = (id: string | null) => id ? layers.find(l => l.id === id)?.node || null : null;

  const applyMeta = (node: AnyNode, meta: BaseMeta) => {
    node.opacity(meta.opacity);
    (node as any).globalCompositeOperation = meta.blend;
    node.getLayer()?.batchDraw();
  };
  const baseMeta = (name: string): BaseMeta => ({
    blend: "source-over", opacity: 1, name, visible: true, locked: false
  });

  // трансформер — скрываем, когда рисуем/стираем
  useEffect(() => {
    const tr = tRef.current;
    const node = findNode(selectedId);
    if (!tr) return;
    if (!node || isDrawing || tool === "brush" || tool === "erase") {
      tr.nodes([]); tr.getLayer()?.batchDraw();
      return;
    }
    tr.nodes([node]);
    (node as any).draggable(tool === "move");
    tr.getLayer()?.batchDraw();
  }, [selectedId, layers, tool, isDrawing]);

  // добавление изображений
  const onUploadImage = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        // масштабируем большие картинки разумно
        const maxSide = Math.min(BASE_W, BASE_H) * 0.8;
        let w = img.width, h = img.height;
        if (w > maxSide || h > maxSide) {
          const k = Math.min(maxSide / w, maxSide / h);
          w *= k; h *= k;
        }
        const node = new Konva.Image({ image: img, x: BASE_W/2 - w/2, y: BASE_H/2 - h/2, width: w, height: h });
        (node as any).id(uid());
        const meta = baseMeta(file.name);
        applyMeta(node, meta);
        const id = (node as any)._id;
        setLayers(p => [...p, { id, side, node, meta, type: "image" }]);
        setSelectedId(id);
        setTool("move");
      };
      img.src = r.result as string;
    };
    r.readAsDataURL(file);
  };

  // текст (инлайн-редактор через <textarea>)
  const createInlineEditor = (node: Konva.Text) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.container().getBoundingClientRect();
    const abs = node.getAbsolutePosition(stage);
    const area = document.createElement("textarea");
    area.value = node.text();
    Object.assign(area.style, {
      position: "absolute",
      top: `${rect.top + abs.y * scale}px`,
      left: `${rect.left + abs.x * scale}px`,
      width: `${Math.max(node.width() * scale, 200)}px`,
      fontSize: `${node.fontSize() * scale}px`,
      fontFamily: node.fontFamily(),
      color: String(node.fill()),
      lineHeight: "1.2",
      padding: "6px",
      background: "rgba(255,255,255,0.95)",
      border: "1px solid #222",
      borderRadius: "4px",
      zIndex: "1000",
      outline: "none",
      resize: "none",
    } as CSSStyleDeclaration);
    document.body.appendChild(area);
    area.focus(); area.select();

    const commit = () => {
      node.text(area.value ?? "");
      node.getLayer()?.batchDraw();
      area.remove();
    };
    area.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); commit(); }
    });
    area.addEventListener("blur", commit);
  };

  const onAddText = () => {
    const node = new Konva.Text({
      text: "Type here...",
      x: BASE_W/2 - 200, y: BASE_H/2 - 30,
      width: 400,
      fontSize: 64,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor,
      align: "center",
    });
    (node as any).id(uid());
    const meta = baseMeta("Text");
    applyMeta(node, meta);
    const id = (node as any)._id;
    setLayers(p => [...p, { id, side, node, meta, type: "text" }]);
    setSelectedId(id);
    setTool("move");
    setTimeout(() => createInlineEditor(node), 80);
  };

  // фигуры
  const addShape = (kind: ShapeKind) => {
    let node: any;
    const size = 140;
    if (kind === "circle")   node = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: size, fill: brushColor });
    if (kind === "square")   node = new Konva.Rect({ x: BASE_W/2 - size, y: BASE_H/2 - size, width: size*2, height: size*2, fill: brushColor });
    if (kind === "triangle") node = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: size*1.2, fill: brushColor });
    if (kind === "line")     node = new Konva.Line({ points: [BASE_W/2 - size, BASE_H/2, BASE_W/2 + size, BASE_H/2], stroke: brushColor, strokeWidth: 10, lineCap: "round" });
    (node as any).id(uid());
    const meta = baseMeta(kind);
    applyMeta(node, meta);
    const id = (node as any)._id;
    setLayers(p => [...p, { id, side, node, meta, type: "shape" }]);
    setSelectedId(id);
    setTool("move");
  };

  // кисть/ластик
  const startStroke = (x:number,y:number) => {
    const line = new Konva.Line({
      points: [x,y],
      stroke: tool === "erase" ? "#ffffff" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
      tension: 0.5,
    });
    (line as any).id(uid());
    const meta = baseMeta("Stroke");
    const id = (line as any)._id;
    setLayers(p => [...p, { id, side, node: line, meta, type: "stroke" }]);
    setSelectedId(id);
    setIsDrawing(true);
  };
  const appendStroke = (x:number,y:number) => {
    const node = findNode(selectedId);
    if (!(node instanceof Konva.Line)) return;
    node.points(node.points().concat([x,y]));
    node.getLayer()?.batchDraw();
  };

  // экспорт (исправлено: не «кропает»)
  const exportSide = (s: Side) => {
    const st = stageRef.current; if (!st) return;
    const hidden: AnyLayer[] = [];
    layers.forEach(l => {
      if (l.side !== s) { l.node.visible(false); hidden.push(l); }
    });
    st.draw();
    // поднимаем pixelRatio обратно к 1:1 с учетом текущего scale
    const data = st.toDataURL({ pixelRatio: 1 / st.scaleX(), mimeType: "image/png" });
    hidden.forEach(l => l.node.visible(l.meta.visible));
    st.draw();

    const a = document.createElement("a");
    a.href = data; a.download = `darkroom-${s}.png`; a.click();
  };

  // обработчики указателя
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 };

  const onDown = () => {
    const p = getPos();
    if (tool === "brush" || tool === "erase") {
      startStroke(p.x / scale, p.y / scale);
    } else if (tool === "text") {
      onAddText();
    } else if (tool === "shape") {
      addShape(shapeKind);
    }
  };
  const onMove = () => {
    if (!isDrawing) return;
    const p = getPos();
    appendStroke(p.x / scale, p.y / scale);
  };
  const onUp = () => setIsDrawing(false);

  if (!mounted) return null; // до гидрации ничего не рендерим — надёжно

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden bg-white">
      {/* Примитивная панель для проверки работоспособности */}
      <div className="absolute left-4 top-4 z-40 bg-white/90 backdrop-blur border rounded px-3 py-2 flex items-center gap-2">
        <button className={`px-2 py-1 border rounded ${tool==="move"?"bg-black text-white":""}`} onClick={()=>setTool("move")}>Move</button>
        <button className={`px-2 py-1 border rounded ${tool==="brush"?"bg-black text-white":""}`} onClick={()=>setTool("brush")}>Brush</button>
        <button className={`px-2 py-1 border rounded ${tool==="erase"?"bg-black text-white":""}`} onClick={()=>setTool("erase")}>Erase</button>
        <button className="px-2 py-1 border rounded" onClick={onAddText}>Text</button>
        <select className="px-2 py-1 border rounded" value={shapeKind} onChange={(e)=>setShapeKind(e.target.value as ShapeKind)}>
          <option value="circle">Circle</option>
          <option value="square">Square</option>
          <option value="triangle">Triangle</option>
          <option value="line">Line</option>
        </select>
        <button className="px-2 py-1 border rounded" onClick={()=>addShape(shapeKind)}>Add</button>
        <input type="color" value={brushColor} onChange={(e)=>setBrushColor(e.target.value)} className="w-8 h-8 p-0 border rounded"/>
        <input type="range" min={1} max={64} value={brushSize} onChange={(e)=>setBrushSize(parseInt(e.target.value))}/>
        <button className={`px-2 py-1 border rounded ${side==="front"?"bg-black text-white":""}`} onClick={()=>setSide("front")}>Front</button>
        <button className={`px-2 py-1 border rounded ${side==="back"?"bg-black text-white":""}`} onClick={()=>setSide("back")}>Back</button>
        <button className="px-2 py-1 border rounded" onClick={()=>document.getElementById("darkroom-upload")?.click()}>Upload</button>
        <button className="px-2 py-1 border rounded" onClick={()=>exportSide("front")}>DL Front</button>
        <button className="px-2 py-1 border rounded" onClick={()=>exportSide("back")}>DL Back</button>
        <input id="darkroom-upload" type="file" accept="image/*" className="hidden" onChange={(e)=>{const f=e.target.files?.[0]; if(f) onUploadImage(f); e.currentTarget.value="";}}/>
      </div>

      {/* Канва */}
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
          className="bg-white"
        >
          {/* мокап (тонкий) */}
          <Layer listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} opacity={0.12}/>}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} opacity={0.12}/>}
          </Layer>

          <Layer>
            {/* «привязка» для перерисовки: реальные ноды в памяти, а тут просто захватываем события */}
            {visLayers.map(l=>(
              <Group key={l.id} onClick={()=>setSelectedId(l.id)} onTap={()=>setSelectedId(l.id)}/>
            ))}
            <Transformer
              ref={tRef}
              rotateEnabled
              anchorSize={10}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
              boundBoxFunc={(oldBox, newBox) => (newBox.width < 10 || newBox.height < 10) ? oldBox : newBox}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
