// Лёгкий GL-рендерер. Без чтения пикселей в JS, только srcCanvas -> GL texture -> outCanvas.
// Есть fallback: если GL не стартанул, просто копируем 2D drawImage (чтобы не было "чёрного").

import type { FxParams } from "./canvas-types";

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = (a_pos + 1.0) * 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2  u_resolution;
uniform float u_cell;
uniform float u_levels;
uniform float u_angle;   // radians
uniform float u_dot;     // 0..1
uniform vec3  u_pal0;
uniform vec3  u_pal1;
uniform vec3  u_pal2;
uniform vec3  u_pal3;
uniform vec3  u_pal4;

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 pickPal(float g, float steps){
  float stepv = 1.0 / max(steps, 1.0);
  if (g < stepv * 1.0) return u_pal4;
  if (g < stepv * 2.0) return u_pal3;
  if (g < stepv * 3.0) return u_pal2;
  if (g < stepv * 4.0) return u_pal1;
  return u_pal0;
}

// поворот сетки
vec2 rot(vec2 p, float a) {
  float s = sin(a), c = cos(a);
  return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
}

void main() {
  // webgl имеет ось Y вниз в текстуре; чтобы "не переворачивало",
  // инвертируем Y сразу (и мокап/арт совпадают)
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec3 src = texture(u_image, uv).rgb;

  float g = luma(src);

  // координаты в пикселях
  vec2 px = vec2(uv.x * u_resolution.x, uv.y * u_resolution.y);

  // поворот и нормализация на ячейку
  vec2 pr = rot(px, u_angle) / max(u_cell, 1.0);

  // центр ячейки -> круглые точки
  vec2 f = fract(pr) - 0.5;
  float r = length(f * 2.0);

  // чем светлее — тем тоньше точка (смягчённый порог)
  float dotMask = smoothstep(u_dot, 0.0, r);

  // палитра «плакатная»
  vec3 baseCol = pickPal(g, u_levels);

  // имитация трафарета (чуть «припечатываем»)
  vec3 col = baseCol * mix(1.0, dotMask, 0.85);

  outColor = vec4(col, 1.0);
}`;

function hexToRGB01(hex: string): [number, number, number] {
  const s = hex.replace("#", "");
  const n = s.length === 3 ? s.split("").map(c => c + c).join("") : s;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export type FxRenderer = {
  ok: boolean;
  render: (src: HTMLCanvasElement, out: HTMLCanvasElement, fx: FxParams) => void;
};

// создаёт/кэширует GL-контекст и шейдеры
export function createFxRenderer(): FxRenderer {
  const out = document.createElement("canvas");
  const gl = out.getContext("webgl2", { premultipliedAlpha: true, preserveDrawingBuffer: false });

  if (!gl) {
    // fallback: мягкое 2D копирование
    return {
      ok: false,
      render: (src, dest) => {
        dest.width = src.width;
        dest.height = src.height;
        const ctx = dest.getContext("2d")!;
        ctx.clearRect(0, 0, dest.width, dest.height);
        ctx.drawImage(src, 0, 0);
      },
    };
  }

  // компиляция
  function compile(type: number, src: string) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(sh));
    }
    return sh;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  // фуллскрин-треугольник
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {
    img: gl.getUniformLocation(prog, "u_image"),
    res: gl.getUniformLocation(prog, "u_resolution"),
    cell: gl.getUniformLocation(prog, "u_cell"),
    levels: gl.getUniformLocation(prog, "u_levels"),
    angle: gl.getUniformLocation(prog, "u_angle"),
    dot: gl.getUniformLocation(prog, "u_dot"),
    p0: gl.getUniformLocation(prog, "u_pal0"),
    p1: gl.getUniformLocation(prog, "u_pal1"),
    p2: gl.getUniformLocation(prog, "u_pal2"),
    p3: gl.getUniformLocation(prog, "u_pal3"),
    p4: gl.getUniformLocation(prog, "u_pal4"),
  };

  return {
    ok: true,
    render: (src, dest, fx) => {
      dest.width = src.width;
      dest.height = src.height;

      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

      (gl.canvas as HTMLCanvasElement).width = dest.width;
      (gl.canvas as HTMLCanvasElement).height = dest.height;
      gl.viewport(0, 0, dest.width, dest.height);
      gl.useProgram(prog);
      gl.uniform1i(U.img, 0);
      gl.uniform2f(U.res, dest.width, dest.height);
      gl.uniform1f(U.cell, fx.cell);
      gl.uniform1f(U.levels, Math.max(1, Math.min(8, fx.levels)));
      gl.uniform1f(U.angle, (fx.angle * Math.PI) / 180);
      gl.uniform1f(U.dot, Math.min(1, Math.max(0, fx.dot)));

      const [r0, g0, b0] = hexToRGB01(fx.palette[0]); gl.uniform3f(U.p0, r0, g0, b0);
      const [r1, g1, b1] = hexToRGB01(fx.palette[1]); gl.uniform3f(U.p1, r1, g1, b1);
      const [r2, g2, b2] = hexToRGB01(fx.palette[2]); gl.uniform3f(U.p2, r2, g2, b2);
      const [r3, g3, b3] = hexToRGB01(fx.palette[3]); gl.uniform3f(U.p3, r3, g3, b3);
      const [r4, g4, b4] = hexToRGB01(fx.palette[4]); gl.uniform3f(U.p4, r4, g4, b4);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Перекладываем GL-canvas в dest без readPixels
      const ctx = dest.getContext("2d")!;
      ctx.clearRect(0, 0, dest.width, dest.height);
      ctx.drawImage(gl.canvas as HTMLCanvasElement, 0, 0);

      gl.deleteTexture(tex);
    },
  };
}
