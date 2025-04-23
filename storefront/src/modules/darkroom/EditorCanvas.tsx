// Final EditorCanvas.tsx draft coming up — all your requests applied.

"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Transformer } from "react-konva";
import useImage from "use-image";
import { useRouter } from "next/navigation";
import { isMobile } from "react-device-detect";

const CANVAS_WIDTH = 985;
const CANVAS_HEIGHT = 1271;
const DISPLAY_HEIGHT = isMobile ? 680 : 750;
const DISPLAY_WIDTH = (DISPLAY_HEIGHT * CANVAS_WIDTH) / CANVAS_HEIGHT;

const EditorCanvas = () => {
  const router = useRouter();
  const [images, setImages] = useState<any[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [opacity, setOpacity] = useState(1);
  const [mockupType, setMockupType] = useState<"front" | "back">("front");
  const [copiedImage, setCopiedImage] = useState<any | null>(null);
  const [drawings, setDrawings] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState("#d63384");
  const [brushSize, setBrushSize] = useState(4);
  const [mode, setMode] = useState<"move" | "brush">("brush");
  const [menuOpen, setMenuOpen] = useState(false);

  const [mockupImage] = useImage(
    mockupType === "front" ? "/mockups/MOCAP_FRONT.png" : "/mockups/MOCAP_BACK.png"
  );

  const transformerRef = useRef<any>(null);
  const stageRef = useRef<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.src = reader.result as string;
        img.onload = () => {
          const newImage = {
            image: img,
            x: 100,
            y: 150,
            width: img.width / 4,
            height: img.height / 4,
            rotation: 0,
            opacity: 1,
            id: Date.now().toString(),
          };
          setImages((prev) => [...prev, newImage]);
          setSelectedImageIndex(images.length);
          setMode("move");
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const scalePos = (pos: { x: number; y: number }) => ({
    x: (pos.x * CANVAS_WIDTH) / DISPLAY_WIDTH,
    y: (pos.y * CANVAS_HEIGHT) / DISPLAY_HEIGHT,
  });

  const handlePointerDown = (e: any) => {
    if (e.target === e.target.getStage()) setSelectedImageIndex(null);
    if (mode !== "brush") return;
    const pos = stageRef.current.getPointerPosition();
    if (!pos) return;
    const scaled = scalePos(pos);
    setIsDrawing(true);
    setDrawings([...drawings, { color: brushColor, size: brushSize, points: [scaled.x, scaled.y] }]);
  };

  const handlePointerMove = () => {
    if (!isDrawing || mode !== "brush") return;
    const pos = stageRef.current.getPointerPosition();
    if (!pos) return;
    const scaled = scalePos(pos);
    const lastLine = drawings[drawings.length - 1];
    lastLine.points = lastLine.points.concat([scaled.x, scaled.y]);
    setDrawings([...drawings.slice(0, -1), lastLine]);
  };

  const handlePointerUp = () => setIsDrawing(false);

  useEffect(() => {
    if (transformerRef.current && selectedImageIndex !== null) {
      const node = stageRef.current.findOne(`#img-${selectedImageIndex}`);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer().batchDraw();
      }
    }
  }, [selectedImageIndex]);

  return (
    <div className="w-screen h-screen bg-white overflow-hidden flex flex-col lg:flex-row">
      <div className={`lg:w-1/2 p-4 ${isMobile ? "absolute z-50 top-0 w-full bg-white" : ""}`}>
        {isMobile && (
          <div className="flex justify-between items-center mb-2">
            <button onClick={() => router.back()} className="text-sm border px-3 py-1">Back</button>
            <button className="text-sm border px-3 py-1" onClick={() => setMenuOpen(!menuOpen)}>Create</button>
          </div>
        )}
        <div className={`${isMobile && !menuOpen ? "hidden" : "block"}`}>
          <div className="flex flex-wrap gap-2 mb-4 text-sm">
            <button className={`border px-3 py-1 ${mode === "move" ? "bg-black text-white" : ""}`} onClick={() => setMode("move")}>Move</button>
            <button className={`border px-3 py-1 ${mode === "brush" ? "bg-black text-white" : ""}`} onClick={() => setMode("brush")}>Brush</button>
            <button className="border px-3 py-1" onClick={() => setMockupType("front")}>Front</button>
            <button className="border px-3 py-1" onClick={() => setMockupType("back")}>Back</button>
            <button className="border px-3 py-1" onClick={() => setDrawings([])}>Clear</button>
            <button className="bg-black text-white px-3 py-1" onClick={() => {
              const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
              const a = document.createElement("a");
              a.href = uri;
              a.download = "composition.png";
              a.click();
            }}>Download</button>
          </div>
          <input type="file" accept="image/*" onChange={handleFileChange} className="mb-3" />
          <label className="block text-xs mb-1">Opacity: {Math.round(opacity * 100)}%</label>
          <input type="range" min="0" max="1" step="0.01" value={opacity} onChange={(e) => {
            setOpacity(Number(e.target.value));
            if (selectedImageIndex !== null) {
              const newImages = [...images];
              newImages[selectedImageIndex].opacity = Number(e.target.value);
              setImages(newImages);
            }
          }} className="w-full mb-2 h-[2px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none" />
          <label className="block text-xs mb-1">Brush Size: {brushSize}px</label>
          <input type="range" min="1" max="30" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full mb-2 h-[2px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none" />
          <label className="block text-xs mb-1">Brush Color</label>
          <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="w-8 h-8 border p-0 cursor-pointer" />
        </div>
      </div>

      <div className="lg:w-1/2 h-full flex items-center justify-center">
        <div style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT, transform: "translateY(-30px) scale(0.95)" }}>
          <Stage
            width={DISPLAY_WIDTH}
            height={DISPLAY_HEIGHT}
            scale={{ x: DISPLAY_WIDTH / CANVAS_WIDTH, y: DISPLAY_HEIGHT / CANVAS_HEIGHT }}
            ref={stageRef}
            onMouseDown={handlePointerDown}
            onMousemove={handlePointerMove}
            onMouseup={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          >
            <Layer>
              {mockupImage && <KonvaImage image={mockupImage} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />}
              {images.map((img, index) => (
                <KonvaImage
                  key={img.id}
                  id={`img-${index}`}
                  image={img.image}
                  x={img.x}
                  y={img.y}
                  width={img.width}
                  height={img.height}
                  rotation={img.rotation}
                  opacity={img.opacity}
                  draggable={mode === "move"}
                  onClick={() => setSelectedImageIndex(index)}
                  onTap={() => setSelectedImageIndex(index)}
                />
              ))}
              {drawings.map((line, i) => (
                <Line
                  key={i}
                  points={line.points}
                  stroke={line.color}
                  strokeWidth={line.size}
                  tension={0.5}
                  lineCap="round"
                  globalCompositeOperation="source-over"
                />
              ))}
              {selectedImageIndex !== null && <Transformer ref={transformerRef} rotateEnabled={true} />}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
};

export default EditorCanvas;
