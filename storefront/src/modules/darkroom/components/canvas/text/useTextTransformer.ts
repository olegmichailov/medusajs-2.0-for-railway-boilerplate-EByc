import Konva from "konva";

const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export type TextSnap = { fs0:number; wrap0:number; cx0:number; cy0:number };

export function captureTextSnap(t: Konva.Text): TextSnap {
  const wrap0 = Math.max(1, t.width() || 1);
  const self  = (t as any).getSelfRect?.() || { width: wrap0, height: Math.max(1, t.height() || 1) };
  const cx0   = Math.round(t.x() + wrap0 / 2);
  const cy0   = Math.round(t.y() + Math.max(1, self.height) / 2);
  return { fs0: t.fontSize(), wrap0, cx0, cy0 };
}

/** Подключает boundBoxFunc к Transformer так, чтобы:
 *  - боковые ручки меняли только wrap width (центрованно)
 *  - углы/вертикальные ручки меняли только fontSize (центрованно)
 *  - scaleX/Y текста всегда сбрасывается в 1 (никаких артефактов)
 */
export function bindTextBoundBox(
  tr: Konva.Transformer,
  t: Konva.Text,
  opts?: { dead?: number; eps?: number; maxW?: number; minFS?: number; maxFS?: number }
) {
  const DEAD = opts?.dead ?? 0.01;
  const EPS  = opts?.eps  ?? 0.25;
  const MINFS = opts?.minFS ?? 8;
  const MAXFS = opts?.maxFS ?? 800;
  const MAXW  = opts?.maxW  ?? 4000;

  let snap: TextSnap | null = null;

  const minLetterW = () => {
    try {
      const m = (t as any).measureSize?.("M");
      if (m && typeof m.width === "number" && m.width > 0) return Math.round(m.width);
    } catch {}
    return Math.max(6, Math.round((t.fontSize() || 12) * 0.55));
  };

  const onStart = () => { snap = captureTextSnap(t); };
  const onEnd   = () => { snap = null; t.scaleX(1); t.scaleY(1); t.getLayer()?.batchDraw(); };

  t.on("transformstart.text-bind", onStart);
  t.on("transformend.text-bind", onEnd);

  (tr as any).boundBoxFunc((oldBox:any, newBox:any) => {
    const s = snap ?? captureTextSnap(t);
    const active = (tr as any)?.getActiveAnchor?.() as string | undefined;

    const ow = Math.max(1e-6, oldBox.width);
    const oh = Math.max(1e-6, oldBox.height);
    const ratioW = newBox.width  / ow;
    const ratioH = newBox.height / oh;

    // Боковые ручки → меняем wrap width
    if (active === "middle-left" || active === "middle-right") {
      if (Math.abs(ratioW - 1) < DEAD) return oldBox;
      const minW  = Math.max(2, minLetterW());
      const nextW = clamp(Math.round(s.wrap0 * ratioW), minW, MAXW);
      if (Math.abs((t.width() || 0) - nextW) > EPS) {
        t.width(nextW);
        t.x(Math.round(s.cx0 - nextW / 2));
      }
      t.scaleX(1); t.scaleY(1);
      t.getLayer()?.batchDraw();
      requestAnimationFrame(()=>tr.forceUpdate());
      return oldBox;
    }

    // Углы и вертикаль → меняем fontSize, удерживаем центр
    const fac = Math.max(ratioW, ratioH);
    if (Math.abs(fac - 1) < DEAD) return oldBox;
    const nextFS = clamp(Math.round(s.fs0 * fac), MINFS, MAXFS);
    if (Math.abs(t.fontSize() - nextFS) > EPS) {
      t.fontSize(nextFS);
      const self = (t as any).getSelfRect?.() || { width: Math.max(1, t.width() || s.wrap0), height: Math.max(1, (t.height() || 1)) };
      const nw = Math.max(1, t.width() || self.width);
      const nh = Math.max(1, self.height);
      t.x(Math.round(s.cx0 - nw/2));
      t.y(Math.round(s.cy0 - nh/2));
    }
    t.scaleX(1); t.scaleY(1);
    t.getLayer()?.batchDraw();
    requestAnimationFrame(()=>tr.forceUpdate());
    return oldBox;
  });
}

/* Примечание:
   boundBoxFunc — штатный способ перехватывать изменение рамки трансформера в Konva/Transformer,
   подходит для стабилизации трансформа, т.ч. используем именно его.  */ 
