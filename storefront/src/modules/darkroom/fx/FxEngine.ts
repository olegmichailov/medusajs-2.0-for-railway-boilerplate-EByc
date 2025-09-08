// storefront/src/modules/darkroom/fx/FxEngine.ts
export type FxMethod =
  | "halftone-mono"
  | "halftone-duo"
  | "halftone-cmyk"
  | "dither-ordered"
  | "dither-error"
  | "threshold"
  | "posterize"
  | "pixelate"

export type FxShape = "dot" | "square" | "line" | "diamond" | "hex"

export type FxParams = {
  method: FxMethod
  // общие
  previewScale?: number
  // halftone
  shape?: FxShape
  cell?: number
  gamma?: number
  minDot?: number
  maxDot?: number
  angle?: number
  duoA?: string
  duoB?: string
  duoAngleB?: number
  cmykAngles?: { C: number; M: number; Y: number; K: number }
  // dither
  bayerSize?: 4 | 8
  diffusion?: "floyd" | "atkinson"
  // misc
  threshold?: number
  posterizeLevels?: number
  pixelSize?: number
}

const clamp01 = (x:number)=>Math.min(1,Math.max(0,x))
const lum = (r:number,g:number,b:number)=>clamp01(0.2126*(r/255)+0.7152*(g/255)+0.0722*(b/255))
const createCanvas = (w:number,h:number)=>{ const c=document.createElement("canvas"); c.width=w; c.height=h; return c }

function getImageDataFrom(src: HTMLImageElement | HTMLCanvasElement, scale = 1) {
  const w = Math.max(1, Math.round((src instanceof HTMLImageElement ? src.naturalWidth : src.width) * scale))
  const h = Math.max(1, Math.round((src instanceof HTMLImageElement ? src.naturalHeight : src.height) * scale))
  const c = createCanvas(w,h); const ctx = c.getContext("2d", { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(src, 0, 0, w, h)
  return { canvas: c, ctx, imageData: ctx.getImageData(0,0,w,h) }
}

const B4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]
const B8 = [
  [0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],[12,44,4,36,14,46,6,38],[60,28,52,20,62,30,54,22],
  [3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],[15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]
]

function drawShape(ctx:CanvasRenderingContext2D, shape:FxShape, cx:number, cy:number, cell:number, frac:number, ang:number, minDot:number, maxDot:number) {
  const minA = Math.max(0, minDot); const maxA = clamp01(Math.max(minA, maxDot))
  const a = minA + (maxA - minA) * frac; if (a <= 0) return
  ctx.beginPath()
  if (shape === "dot") {
    const r = 0.5 * cell * Math.sqrt(a); ctx.arc(cx, cy, r, 0, Math.PI*2)
  } else if (shape === "square") {
    const s = cell * Math.sqrt(a); ctx.rect(cx - s/2, cy - s/2, s, s)
  } else if (shape === "line") {
    const t = Math.max(1, cell * a * 0.8)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.rect(-cell/2, -t/2, cell, t); ctx.restore()
  } else if (shape === "diamond") {
    const s = cell * Math.sqrt(a); ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI/4); ctx.rect(-s/2, -s/2, s, s); ctx.restore()
  } else {
    const r = 0.5 * cell * Math.sqrt(a) * 1.15
    ctx.moveTo(cx + r, cy); for (let i=1;i<6;i++){ const th=(i*Math.PI)/3; ctx.lineTo(cx + r*Math.cos(th), cy + r*Math.sin(th)) } ctx.closePath()
  }
  ctx.fill()
}

function monoHalftone(out:CanvasRenderingContext2D, src:ImageData, p:{cell:number;gamma:number;minDot:number;maxDot:number;angle:number;shape:FxShape}) {
  const {width,height,data}=src; const cx=width/2, cy=height/2; const ang=(p.angle*Math.PI)/180
  const cosA=Math.cos(-ang), sinA=Math.sin(-ang)
  const L=new Float32Array(width*height); for(let i=0,j=0;i<data.length;i+=4,j++) L[j]=lum(data[i],data[i+1],data[i+2])
  out.clearRect(0,0,width,height); out.fillStyle="#000"
  for (let y=0;y<height;y+=p.cell) for (let x=0;x<width;x+=p.cell) {
    const rx=x+p.cell*0.5, ry=y+p.cell*0.5, dx=rx-cx, dy=ry-cy
    const sx=cx+dx*cosA-dy*sinA, sy=cy+dx*sinA+dy*cosA
    const ix=Math.max(0,Math.min(width-1,sx|0)), iy=Math.max(0,Math.min(height-1,sy|0))
    const t=L[iy*width+ix]; const frac=Math.pow(1-t, p.gamma)
    drawShape(out, p.shape, rx, ry, p.cell, frac, ang, p.minDot, p.maxDot)
  }
}

function ditherOrdered(out:CanvasRenderingContext2D, src:ImageData, size:4|8){
  const M = size===4?B4:B8; const N=size; const N2=N*N
  const {width,height,data}=src; const img=out.getImageData(0,0,width,height); const o=img.data
  for(let y=0;y<height;y++) for(let x=0;x<width;x++){
    const i=(y*width+x)*4; const L = lum(data[i],data[i+1],data[i+2]); const thr=(M[y%N][x%N]+0.5)/N2; const v=L<thr?0:255
    o[i]=o[i+1]=o[i+2]=v; o[i+3]=255
  }
  out.putImageData(img,0,0)
}

function ditherError(out:CanvasRenderingContext2D, src:ImageData, method:"floyd"|"atkinson"){
  const {width,height,data}=src; const buf=new Float32Array(width*height)
  for(let i=0,j=0;i<data.length;i+=4,j++) buf[j]=lum(data[i],data[i+1],data[i+2])*255
  const get=(x:number,y:number)=>buf[y*width+x]; const set=(x:number,y:number,v:number)=>{buf[y*width+x]=v}
  for(let y=0;y<height;y++){ for(let x=0;x<width;x++){
    const old=get(x,y), nv=old<128?0:255, err=old-nv; set(x,y,nv)
    if(method==="floyd"){
      if(x+1<width) set(x+1,y, get(x+1,y)+err*(7/16))
      if(x-1>=0&&y+1<height) set(x-1,y+1, get(x-1,y+1)+err*(3/16))
      if(y+1<height) set(x,y+1, get(x,y+1)+err*(5/16))
      if(x+1<width&&y+1<height) set(x+1,y+1, get(x+1,y+1)+err*(1/16))
    } else {
      const w:[[number,number,number]]|any = [[1,0,1/8],[2,0,1/8],[-1,1,1/8],[0,1,1/8],[1,1,1/8],[0,2,1/8]]
      for(const [dx,dy,k] of w){ const nx=x+dx, ny=y+dy; if(nx>=0&&nx<width&&ny>=0&&ny<height) set(nx,ny,get(nx,ny)+err*k) }
    }
  }}  
  const img=out.getImageData(0,0,width,height); const o=img.data
  for(let i=0,j=0;j<buf.length;j++,i+=4){ const v=buf[j]<=0?0:buf[j]>=255?255:buf[j]; o[i]=o[i+1]=o[i+2]=v; o[i+3]=255 }
  out.putImageData(img,0,0)
}

export async function renderFX(src: HTMLImageElement | HTMLCanvasElement, params: FxParams): Promise<HTMLCanvasElement> {
  const p: Required<FxParams> = {
    method: params.method,
    previewScale: params.previewScale ?? 1,
    shape: params.shape ?? "dot",
    cell: params.cell ?? 8,
    gamma: params.gamma ?? 1.0,
    minDot: params.minDot ?? 0.06,
    maxDot: params.maxDot ?? 0.95,
    angle: params.angle ?? 45,
    duoA: params.duoA ?? "#111111",
    duoB: params.duoB ?? "#FF2A6D",
    duoAngleB: params.duoAngleB ?? 30,
    cmykAngles: params.cmykAngles ?? { C: 15, M: 75, Y: 0, K: 45 },
    bayerSize: params.bayerSize ?? 8,
    diffusion: params.diffusion ?? "floyd",
    threshold: params.threshold ?? 0.5,
    posterizeLevels: params.posterizeLevels ?? 6,
    pixelSize: params.pixelSize ?? 8,
  }

  const { canvas, imageData } = getImageDataFrom(src, p.previewScale)
  const out = createCanvas(canvas.width, canvas.height)
  const octx = out.getContext("2d", { willReadFrequently: true })!

  switch (p.method) {
    case "halftone-mono":
      monoHalftone(octx, imageData, { cell:p.cell, gamma:p.gamma, minDot:p.minDot, maxDot:p.maxDot, angle:p.angle, shape:p.shape })
      break
    case "halftone-duo": {
      const a = createCanvas(out.width, out.height), b = createCanvas(out.width, out.height)
      monoHalftone(a.getContext("2d")!, imageData, { cell:p.cell, gamma:p.gamma, minDot:p.minDot, maxDot:p.maxDot, angle:p.angle, shape:p.shape })
      monoHalftone(b.getContext("2d")!, imageData, { cell:p.cell, gamma:p.gamma, minDot:0, maxDot:p.maxDot*0.8, angle:p.angle+p.duoAngleB, shape:p.shape })
      octx.clearRect(0,0,out.width,out.height)
      octx.fillStyle = p.duoA; octx.globalCompositeOperation="source-over"; octx.drawImage(a,0,0); octx.globalCompositeOperation="source-in"; octx.fillRect(0,0,out.width,out.height)
      octx.globalCompositeOperation="source-over"; octx.drawImage(b,0,0); octx.globalCompositeOperation="source-in"; octx.fillStyle=p.duoB; octx.fillRect(0,0,out.width,out.height)
      octx.globalCompositeOperation="source-over"
      break
    }
    case "halftone-cmyk": {
      const plate = (ang:number) => {
        const c = createCanvas(out.width,out.height); const cx=c.getContext("2d")!
        monoHalftone(cx, imageData, { cell:p.cell, gamma:p.gamma, minDot:p.minDot, maxDot:p.maxDot, angle:ang, shape:p.shape })
        return c
      }
      octx.clearRect(0,0,out.width,out.height)
      const tint = (canvas:HTMLCanvasElement, color:string)=>{
        octx.drawImage(canvas,0,0); octx.globalCompositeOperation="source-in"; octx.fillStyle=color; octx.fillRect(0,0,out.width,out.height); octx.globalCompositeOperation="multiply"
      }
      tint(plate(p.cmykAngles.C), "#00A0E0")
      tint(plate(p.cmykAngles.M), "#FF40A0")
      tint(plate(p.cmykAngles.Y), "#FFC000")
      tint(plate(p.cmykAngles.K), "#000000")
      octx.globalCompositeOperation="source-over"
      break
    }
    case "dither-ordered":
      octx.drawImage(canvas,0,0); ditherOrdered(octx, imageData, p.bayerSize); break
    case "dither-error":
      octx.drawImage(canvas,0,0); ditherError(octx, imageData, p.diffusion); break
    case "threshold": {
      const img = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)
      const d = img.data; for(let i=0;i<d.length;i+=4){ const L=lum(d[i],d[i+1],d[i+2]); const v=L<p.threshold*255?0:255; d[i]=d[i+1]=d[i+2]=v; d[i+3]=255 }
      octx.putImageData(img,0,0); break
    }
    case "posterize": {
      const levels = Math.max(2, Math.min(32, p.posterizeLevels))
      const step = 255/(levels-1)
      const img=new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)
      const d=img.data; for(let i=0;i<d.length;i+=4){ d[i]=Math.round(d[i]/step)*step; d[i+1]=Math.round(d[i+1]/step)*step; d[i+2]=Math.round(d[i+2]/step)*step; d[i+3]=255 }
      octx.putImageData(img,0,0); break
    }
    case "pixelate": {
      const s = Math.max(2, p.pixelSize|0); octx.imageSmoothingEnabled=false
      octx.drawImage(canvas,0,0,out.width/s,out.height/s); octx.drawImage(out,0,0,out.width/s,out.height/s,0,0,out.width,out.height); break
    }
  }

  return out
}
